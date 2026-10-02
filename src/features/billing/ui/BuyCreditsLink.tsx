import Link from "next/link";

/** The server's 402 says "No … credits remaining"; those errors get a way to buy more. */
export function outOfCredits(message: string): boolean {
  return /credits remaining/i.test(message);
}

export function BuyCreditsLink() {
  return (
    <Link href="/profile#credits" className="ml-2 font-medium underline underline-offset-4">
      Buy credits
    </Link>
  );
}
