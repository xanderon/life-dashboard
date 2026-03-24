import { Orbitron, Share_Tech_Mono } from 'next/font/google';
import { TricorderConsole } from './tricorder-console';
import styles from './tricorder.module.css';

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-tricorder-display',
});

const shareTechMono = Share_Tech_Mono({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-tricorder-mono',
});

export default function TricorderPage() {
  return (
    <main className={`${styles.shell} ${orbitron.variable} ${shareTechMono.variable}`}>
      <TricorderConsole />
    </main>
  );
}
