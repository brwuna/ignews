import type { AppProps } from 'next/app'
import { Header } from '../components/Header'
import {SessionProvider as NextAuthProvider} from 'next-auth/react'

import '../styles/global.scss'

export default function App({ Component, pageProps }: AppProps) {
  return (
      <NextAuthProvider session={pageProps.session}>
        <Header />
        <Component {...pageProps} />
      </NextAuthProvider>
  )
}
