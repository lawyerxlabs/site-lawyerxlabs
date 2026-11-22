import { useState, type FormEvent } from "react"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Status = "idle" | "sending" | "done" | "error"

// POSTs to waitlist-server (nginx: /api/waitlist). Duplicate emails also return ok, so the page never reveals who is signed up.
export function WaitlistForm({ source }: { source?: string } = {}) {
  const [status, setStatus] = useState<Status>("idle")

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setStatus("sending")
    const payload: Record<string, string> = {
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      website: String(data.get("website") ?? ""),
    }
    if (source) payload.source = source
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      setStatus(res.ok ? "done" : "error")
    } catch {
      setStatus("error")
    }
  }

  if (status === "done") {
    return <p className="landing-form" role="status">You are on the waitlist. Joining does not guarantee access or an invitation. We will email you about new tools.</p>
  }

  return (
    <form className="landing-form" onSubmit={handleSubmit}>
      <div className="landing-form-field">
        <Label htmlFor="waitlist-name">Name</Label>
        <Input id="waitlist-name" name="name" type="text" autoComplete="name" required maxLength={120} />
      </div>
      <div className="landing-form-field">
        <Label htmlFor="waitlist-email">Email</Label>
        <Input id="waitlist-email" name="email" type="email" autoComplete="email" required maxLength={254} />
      </div>
      {/* Honeypot: hidden from people and assistive tech; the server drops submissions that fill it. */}
      <input name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-10000px" }} />
      {status === "error" && <Alert variant="destructive">Could not join the waitlist. Check your name and email, then try again.</Alert>}
      <Button type="submit" variant="secondary" disabled={status === "sending"}>Join Waitlist</Button>
      <p className="landing-cta-note">By joining, you agree to get emails from LawyerLab about new tools. Unsubscribe any time. We keep your email, never your documents.</p>
    </form>
  )
}
