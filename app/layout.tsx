import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'North Pole Quest',description:'An interactive winter treasure hunt for curious explorers.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
