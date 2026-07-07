import { useEffect, useState } from "react";
import type { FormEvent } from "react";

const API = import.meta.env.PUBLIC_API_BASE_URL ?? "http://localhost:8080";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RSVP({ eventID = "" }: { eventID?: string }) {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    attendance: "yes",
  });
  const canSubmit =
    form.firstName.trim() !== "" &&
    form.lastName.trim() !== "" &&
    EMAIL_RE.test(form.email.trim());

  useEffect(() => {
    const t = new URLSearchParams(location.hash.slice(1)).get("rsvp");

    if (!t) {
      setStatus("missing");
      return;
    }

    setToken(t);

    fetch(`${API}/events/${eventID}/rsvp/me`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          setStatus("invalid");
          return;
        }

        if (!res.ok) throw new Error("failed");

        const data = await res.json();

        if (data.rsvp) {
          setForm({
            email: data.rsvp.email,
            firstName: data.rsvp.firstName,
            lastName: data.rsvp.lastName,
            attendance: data.rsvp.attendance,
          });
        }

        setStatus("ready");
      })
      .catch(() => {
        setStatus("error");
        setMessage("Something went wrong while checking your invite.");
      });
  }, [eventID]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (!canSubmit) {
      setMessage("Enter your first name, last name, and a valid email.");
      return;
    }

    setStatus("saving");

    try {
      const res = await fetch(`${API}/events/${eventID}/rsvp/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          email: form.email.trim(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
        }),
      });

      if (!res.ok) throw new Error("failed");

      setStatus("ready");
      setMessage("Your RSVP has been saved.");
      window.dispatchEvent(new Event("rsvp:saved"));
    } catch {
      setStatus("error");
      setMessage("Something went wrong while saving your RSVP.");
    }
  }

  if (status === "missing") {
    return (
      <section className="border-foreground-alt/50 mt-8 rounded-sm border p-4 mb-8">
        <h2 className="mb-2 text-lg font-semibold">RSVP</h2>
        <p className="text-foreground/75 text-sm">
          An invite link is required to view event and RSVP.
        </p>
      </section>
    );
  }

  if (status === "invalid") {
    return (
      <section className="border-foreground-alt/50 mt-8 rounded-sm border p-4 mb-8">
        <h2 className="mb-2 text-lg font-semibold">RSVP</h2>
        <p className="text-foreground/75 text-sm">
          This invite is invalid or expired.
        </p>
      </section>
    );
  }

  return (
    <section className="border-foreground-alt/50 mt-8 rounded-sm border p-4 mb-8">
      <h2 className="mb-1 text-lg font-semibold">RSVP</h2>
      <p className="text-foreground/75 mb-4 text-xs">
        Let me know if you're coming (use real name please)
      </p>

      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="border-foreground-alt/50 bg-background rounded-sm border px-2 py-1.5 text-sm"
            placeholder="First name"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            required
          />
          <input
            className="border-foreground-alt/50 bg-background rounded-sm border px-2 py-1.5 text-sm"
            placeholder="Last name"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            required
          />
        </div>

        <input
          className="border-foreground-alt/50 bg-background w-full rounded-sm border px-2 py-1.5 text-sm"
          type="email"
          placeholder="Email"
          pattern={EMAIL_RE.source}
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />

        <div className="flex gap-2">
          {["yes", "no", "maybe"].map((value) => (
            <button
              key={value}
              type="button"
              className={[
                "border-foreground-alt/50 cursor-pointer rounded-sm border px-3 py-1.5 text-xs capitalize",
                form.attendance === value
                  ? "bg-foreground-alt text-background"
                  : "hover:text-foreground-alt",
              ].join(" ")}
              onClick={() =>
                setForm((current) => ({ ...current, attendance: value }))
              }
            >
              {value}
            </button>
          ))}
        </div>

        {message && <p className="text-foreground/75 text-xs">{message}</p>}

        <button
          className="border-foreground-alt/50 hover:text-foreground-alt cursor-pointer rounded-sm border px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canSubmit || status === "loading" || status === "saving"}
        >
          {status === "saving" ? "Saving..." : "Save RSVP"}
        </button>
      </form>
    </section>
  );
}
