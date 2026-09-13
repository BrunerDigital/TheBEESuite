function notificationBodyUrl(body: string) {
  return body.match(/https?:\/\/[^\s)]+/i)?.[0] ?? null;
}

export function PaymentFormDestination({ body }: { body: string }) {
  const href = notificationBodyUrl(body);

  if (!href) {
    return <span className="mt-2 inline-flex text-xs text-muted-foreground">Payment form link unavailable</span>;
  }

  return (
    <a
      className="mt-2 inline-flex min-h-11 items-center rounded-sm text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={href}
    >
      Open payment form
    </a>
  );
}
