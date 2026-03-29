'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getCouncil, getSynthesis, getMessages } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { VerdictCard } from '@/components/councils/VerdictCard';
import { PositionRail } from '@/components/councils/PositionRail';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ArrowLeft, Share, Download } from 'lucide-react';
import Link from 'next/link';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

function SynthesisContent() {
  const params = useParams<{ id: string }>();

  const { data: council, isLoading: councilLoading } = useQuery({
    queryKey: ['council', params.id],
    queryFn: () => getCouncil(params.id),
  });

  const { data: synthesis, isLoading: synthLoading } = useQuery({
    queryKey: ['synthesis', params.id],
    queryFn: () => getSynthesis(params.id),
    enabled: !!council,
    retry: 1,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['messages', params.id],
    queryFn: () => getMessages(params.id, { limit: 500 }),
    enabled: !!council,
  });

  async function handleExport() {
    if (!council || !synthesis) return;
    const data = { council, synthesis, messages };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verdict-${params.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: council?.title, url });
    } else {
      await navigator.clipboard.writeText(url);
    }
  }

  if (councilLoading || synthLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!council) {
    return (
      <div className="p-6 text-center">
        <p className="text-[#F05A5A] mb-4">Council not found</p>
        <Link href="/councils">
          <Button variant="outline" size="sm">Back to Councils</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link href={`/councils/${params.id}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft size={14} />
              Back to Debate
            </Button>
          </Link>
          <h1 className="text-xl font-semibold text-[#E8E8F0]">Verdict</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share size={13} />
            Share
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!synthesis}>
            <Download size={13} />
            Export
          </Button>
        </div>
      </div>

      {!synthesis ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-[#8B90B8] mb-3">No synthesis generated yet</p>
          <p className="text-xs text-[#4A5070] mb-6">
            Return to the debate and click "Synthesize" to generate a verdict.
          </p>
          <Link href={`/councils/${params.id}`}>
            <Button variant="default">Go to Debate</Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <VerdictCard council={council} synthesis={synthesis} />

          {messages.length > 0 && council.participants.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-[#E8E8F0]">Position Timeline</h3>
                <p className="text-xs text-[#8B90B8] mt-0.5">
                  Each dot = one round. Amber outline = position changed mid-debate.
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                <PositionRail
                  messages={messages}
                  participants={council.participants.map((p) => ({
                    agent_id: p.agent_id,
                    name: p.name,
                  }))}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export default function SynthesisPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <SynthesisContent />
    </QueryClientProvider>
  );
}
