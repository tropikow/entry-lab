import ChartComponent from '@/components/ChartComponent';
import PriceCards from '@/components/PriceCards';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0b0e14] p-6 text-[#d1d4dc]">
      <h1 className="mb-6 text-2xl font-bold">Precios en tiempo real</h1>
      <div className="mb-8">
        <PriceCards />
      </div>
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-medium text-[#787b86]">Bitcoin (BTC)</h2>
          <ChartComponent symbol="BTCUSDT" color="#f7931a" />
        </section>
        <section>
          <h2 className="mb-3 text-lg font-medium text-[#787b86]">Ethereum (ETH)</h2>
          <ChartComponent symbol="ETHUSDT" color="#627eea" />
        </section>
      </div>
    </div>
  );
}
