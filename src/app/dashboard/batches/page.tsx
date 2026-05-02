import { getDevices } from '@/actions/dashboard';
import BatchForm from '@/components/BatchForm';
import { SendToBack } from 'lucide-react';

export default async function BatchesPage() {
  const devices = await getDevices();
  
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 flex items-center gap-3 mb-8">
        <SendToBack className="text-emerald-500" /> İş Emri (Batch) Gönderimi
      </h1>
      <BatchForm devices={devices} />
    </div>
  );
}
