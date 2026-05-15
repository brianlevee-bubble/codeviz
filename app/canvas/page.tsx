import { CanvasLayout } from '@/components/CanvasLayout';
import { redirect } from 'next/navigation';

interface Props {
  searchParams: Promise<{ path?: string }>;
}

export default async function CanvasPage({ searchParams }: Props) {
  const { path } = await searchParams;

  if (!path) {
    redirect('/');
  }

  return <CanvasLayout directoryPath={path} />;
}
