import Image from "next/image"
import Link  from "next/link"
import { useRouter } from "next/router"
import logo from "../../../public/images/logo.svg"
import { SignInButton } from "../SignInButton"
import styles from "./styles.module.scss"

export function Header() {
    const { asPath } = useRouter()
    return (
        <header className={styles.headerContainer}>
            <div className={styles.headerContent}>
                <Image src={logo} alt="ig.news" />
                <nav>
                    <Link href="/" className={asPath === '/' ? styles.active : ''}>Home</Link>

                    <Link href="/posts" className={asPath === '/posts' ? styles.active : ''}>Posts</Link>
                </nav>

                <SignInButton />
            </div>
        </header>
    )
}