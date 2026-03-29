"""
Notification engine — reaches humans wherever they are.

When a twin escalates or a meeting concludes, this engine fires through
all active channels for the relevant human identity: SMS, email, webhook,
Slack, Discord, or push.

Providers:
- SMS:     Twilio (primary) — config: {account_sid, auth_token, from_number}
- Email:   SendGrid (primary) — config: {api_key, from_email, from_name}
- Webhook: HTTP POST — signed with HMAC-SHA256 using channel.config.secret
- Slack:   Incoming webhook POST
- Discord: Webhook POST
- Push:    Web Push (pywebpush) — config: {vapid_private_key, vapid_claims}

All providers are optional — the system works with whatever is configured.
Missing credentials → skip that channel, log warning.
"""
import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Notification payload types
# ---------------------------------------------------------------------------

NOTIFICATION_TEMPLATES = {
    "twin_needs_input": {
        "subject": "🤖 Your twin needs your input",
        "sms": "Council: Your twin {agent_name} needs guidance on: {reason}. Reply to continue the meeting. Council: {council_title}",
        "body": (
            "Your digital twin **{agent_name}** is in a meeting about "
            "**{council_title}** and hit a decision it can't make without you.\n\n"
            "**What needs your input:**\n{reason}\n\n"
            "**What your twin was going to say:**\n{tentative_response}\n\n"
            "Reply with your instruction and the meeting will continue. "
            "If you don't respond within {timeout_minutes} minutes, your twin will abstain."
        ),
    },
    "meeting_complete": {
        "subject": "✅ Meeting complete: {council_title}",
        "sms": "Meeting done: {council_title}. Took {duration}. Recommendation: {recommendation_preview}",
        "body": (
            "The meeting **{council_title}** has concluded.\n\n"
            "**Time taken:** {duration} (estimated: {estimated_duration})\n"
            "**Compression ratio:** {compression_ratio}x faster than a live meeting\n\n"
            "**Result:** {recommendation}\n\n"
            "**Vote:** YES: {yes_count} | NO: {no_count} | ABSTAIN: {abstain_count}\n\n"
            "View full transcript and synthesis: {council_url}"
        ),
    },
    "synthesis_ready": {
        "subject": "📊 Synthesis ready: {council_title}",
        "sms": "Synthesis ready for {council_title}. View at {council_url}",
        "body": (
            "A new synthesis is available for **{council_title}**.\n\n"
            "**Consensus:** {consensus}\n\n"
            "View full synthesis: {council_url}"
        ),
    },
    "agent_mention": {
        "subject": "💬 You were mentioned in {council_title}",
        "sms": "{agent_name} mentioned you in {council_title}: {message_preview}",
        "body": (
            "**{agent_name}** mentioned you in **{council_title}**:\n\n"
            "> {message_content}\n\n"
            "Join the debate: {council_url}"
        ),
    },
    "twin_position_changed": {
        "subject": "↔️ Your twin reversed its position",
        "sms": "Your twin {agent_name} changed from {old_stance} to {new_stance} in {council_title}",
        "body": (
            "Your digital twin **{agent_name}** reversed its position in "
            "**{council_title}**.\n\n"
            "Was: **{old_stance}**\nNow: **{new_stance}**\n\n"
            "Reason: {reasoning}\n\n"
            "View the debate: {council_url}"
        ),
    },
}


class NotificationEngine:
    """
    Routes notifications to the correct provider(s) for a human identity.
    Instantiate once; reuse across the application lifetime.
    """

    def __init__(self):
        self._http = None  # lazy httpx client

    async def _client(self) -> httpx.AsyncClient:
        if self._http is None or self._http.is_closed:
            self._http = httpx.AsyncClient(timeout=10.0)
        return self._http

    async def notify(
        self,
        identity: str,
        event_type: str,
        context: dict,
        council_id: Optional[UUID] = None,
    ) -> list[dict]:
        """
        Fire notifications for all active channels matching this identity + event_type.
        Returns list of delivery results.

        Must be called from within an async context with DB access.
        Import inside to avoid circular imports.
        """
        from app.db import AsyncSessionLocal  # noqa: PLC0415
        from app.models.council import NotificationChannel  # noqa: PLC0415
        from sqlalchemy import select  # noqa: PLC0415

        results = []
        template = NOTIFICATION_TEMPLATES.get(event_type, {})

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(NotificationChannel).where(
                    NotificationChannel.identity == identity,
                    NotificationChannel.is_active == True,  # noqa: E712
                )
            )
            channels = result.scalars().all()

        for channel in channels:
            if event_type not in (channel.notify_on or []):
                continue

            try:
                result = await self._dispatch(channel, event_type, template, context)
                results.append(result)

                # Update last_notified_at
                async with AsyncSessionLocal() as db:
                    from sqlalchemy import update  # noqa: PLC0415
                    await db.execute(
                        update(NotificationChannel)
                        .where(NotificationChannel.id == channel.id)
                        .values(last_notified_at=datetime.now(timezone.utc))
                    )
                    await db.commit()

            except Exception as exc:
                logger.error("Notification failed for channel %s: %s", channel.id, exc)
                results.append({
                    "channel_id": str(channel.id),
                    "channel_type": channel.channel_type,
                    "status": "failed",
                    "error": str(exc),
                })

        return results

    async def _dispatch(self, channel, event_type: str, template: dict, context: dict) -> dict:
        """Route to the right provider."""
        ch_type = channel.channel_type
        cfg = channel.config or {}

        if ch_type == "webhook":
            return await self._send_webhook(channel, event_type, context)
        elif ch_type == "sms":
            return await self._send_sms(channel, cfg, template, context)
        elif ch_type == "email":
            return await self._send_email(channel, cfg, template, context)
        elif ch_type in ("slack", "discord"):
            return await self._send_slack_discord(channel, template, context)
        elif ch_type == "push":
            return await self._send_push(channel, cfg, template, context)
        else:
            return {"channel_type": ch_type, "status": "skipped", "reason": "unknown_type"}

    async def _send_webhook(self, channel, event_type: str, context: dict) -> dict:
        """HTTP POST with HMAC-SHA256 signature."""
        payload = json.dumps({"event": event_type, "data": context, "timestamp": int(time.time())})
        headers = {"Content-Type": "application/json", "X-Council-Event": event_type}

        secret = (channel.config or {}).get("secret") or ""
        if secret:
            sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
            headers["X-Council-Signature"] = f"sha256={sig}"

        client = await self._client()
        resp = await client.post(channel.destination, content=payload, headers=headers)
        return {
            "channel_type": "webhook",
            "channel_id": str(channel.id),
            "status": "sent" if resp.is_success else "failed",
            "http_status": resp.status_code,
        }

    async def _send_sms(self, channel, cfg: dict, template: dict, context: dict) -> dict:
        """Twilio SMS."""
        account_sid = cfg.get("account_sid") or getattr(settings, "twilio_account_sid", "")
        auth_token = cfg.get("auth_token") or getattr(settings, "twilio_auth_token", "")
        from_number = cfg.get("from_number") or getattr(settings, "twilio_from_number", "")

        if not all([account_sid, auth_token, from_number]):
            return {"channel_type": "sms", "status": "skipped", "reason": "twilio_not_configured"}

        body_template = template.get("sms", "{event_type} notification")
        try:
            body = body_template.format(**context)
        except KeyError:
            body = body_template

        client = await self._client()
        resp = await client.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json",
            data={"To": channel.destination, "From": from_number, "Body": body[:1600]},
            auth=(account_sid, auth_token),
        )
        return {
            "channel_type": "sms",
            "channel_id": str(channel.id),
            "status": "sent" if resp.is_success else "failed",
            "http_status": resp.status_code,
        }

    async def _send_email(self, channel, cfg: dict, template: dict, context: dict) -> dict:
        """SendGrid email."""
        api_key = cfg.get("api_key") or getattr(settings, "sendgrid_api_key", "")
        from_email = cfg.get("from_email", "council@council.app")
        from_name = cfg.get("from_name", "Council Platform")

        if not api_key:
            return {"channel_type": "email", "status": "skipped", "reason": "sendgrid_not_configured"}

        subject_template = template.get("subject", "Council notification")
        body_template = template.get("body", "{event_type}")
        try:
            subject = subject_template.format(**context)
            body = body_template.format(**context)
        except KeyError:
            subject = subject_template
            body = body_template

        payload = {
            "personalizations": [{"to": [{"email": channel.destination}], "subject": subject}],
            "from": {"email": from_email, "name": from_name},
            "content": [{"type": "text/plain", "value": body}],
        }

        client = await self._client()
        resp = await client.post(
            "https://api.sendgrid.com/v3/mail/send",
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
        )
        return {
            "channel_type": "email",
            "channel_id": str(channel.id),
            "status": "sent" if resp.status_code == 202 else "failed",
            "http_status": resp.status_code,
        }

    async def _send_slack_discord(self, channel, template: dict, context: dict) -> dict:
        """Slack or Discord incoming webhook."""
        body_template = template.get("body", "{event_type}")
        try:
            text = body_template.format(**context)
        except KeyError:
            text = body_template

        # Slack expects {"text": "..."}, Discord expects {"content": "..."}
        if channel.channel_type == "slack":
            payload = {"text": text[:4000]}
        else:
            payload = {"content": text[:2000]}

        client = await self._client()
        resp = await client.post(channel.destination, json=payload)
        return {
            "channel_type": channel.channel_type,
            "channel_id": str(channel.id),
            "status": "sent" if resp.is_success else "failed",
            "http_status": resp.status_code,
        }

    async def _send_push(self, channel, cfg: dict, template: dict, context: dict) -> dict:
        """Web Push via pywebpush (optional dependency)."""
        try:
            from pywebpush import webpush, WebPushException  # type: ignore
        except ImportError:
            return {"channel_type": "push", "status": "skipped", "reason": "pywebpush_not_installed"}

        subject_template = template.get("subject", "Council")
        body_template = template.get("body", "{event_type}")
        try:
            subject = subject_template.format(**context)
            body = body_template.format(**context)[:200]
        except KeyError:
            subject = subject_template
            body = body_template[:200]

        vapid_private_key = cfg.get("vapid_private_key")
        vapid_claims = cfg.get("vapid_claims", {"sub": "mailto:council@council.app"})
        subscription_info = json.loads(channel.destination)

        if not vapid_private_key:
            return {"channel_type": "push", "status": "skipped", "reason": "vapid_not_configured"}

        try:
            webpush(
                subscription_info=subscription_info,
                data=json.dumps({"title": subject, "body": body}),
                vapid_private_key=vapid_private_key,
                vapid_claims=vapid_claims,
            )
            return {"channel_type": "push", "channel_id": str(channel.id), "status": "sent"}
        except Exception as exc:
            return {"channel_type": "push", "channel_id": str(channel.id), "status": "failed", "error": str(exc)}

    async def close(self):
        if self._http and not self._http.is_closed:
            await self._http.aclose()


# Singleton instance
notification_engine = NotificationEngine()
