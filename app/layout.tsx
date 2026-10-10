import './globals.css';
import { Inter } from 'next/font/google';

const inter=Inter({subsets:['latin'],display:'swap',variable:'--font-inter'});
export const metadata={title:'Koncerter København',description:'Kommende koncerter i København samlet ét sted'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="da" className={inter.variable}><body>{children}</body></html>}
