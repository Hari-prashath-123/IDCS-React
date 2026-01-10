import { useState } from "react";
import { Mail, AlertCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import AuthHeader from "../components/AuthHeader";

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const navigate = useNavigate();

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      let emailToUse = identifier.trim();
      if (!emailToUse)
        throw new Error("Please enter your email or register number");

      // If user entered a reg_no, look up email
      if (!emailToUse.includes("@")) {
        const { data: studentRow, error: sErr } = await supabase
          .from("students")
          .select("id")
          .eq("reg_no", emailToUse)
          .maybeSingle();
        if (sErr) throw sErr;
        if (!studentRow)
          throw new Error("No account found for that register number");
        const { data: profRow, error: pErr } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", studentRow.id)
          .maybeSingle();
        if (pErr) throw pErr;
        if (!profRow || !profRow.email)
          throw new Error("No email associated with that register number");
        emailToUse = profRow.email;
      }

      // Send reset email via Supabase (use auth callback so we can route by `type`)
      const redirectTo = `${window.location.origin}/auth/callback`;
      const start = Date.now();
      const { error, data } = await supabase.auth.resetPasswordForEmail(
        String(emailToUse),
        { redirectTo }
      );
      const took = Date.now() - start;
      console.info('resetPasswordForEmail response', { data, error, took });
      if (error) throw error;

      setSentAt(Date.now());
      setResendCooldown(60); // 60s cooldown before allowing resend
      setMessage(
        `If that email exists, a password reset link was requested (${new Date().toLocaleTimeString()}). Check inbox/spam. Delivery may take a few minutes.`
      );
      // Optionally navigate to a confirmation page or keep on this page
    } catch (err: any) {
      console.error("ForgotPassword error", err);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  // cooldown timer for resend button
  React.useEffect(() => {
    if (!resendCooldown) return;
    const t = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          clearInterval(t);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex flex-col pt-16">
      <AuthHeader />
      <div className="flex-1 flex items-center justify-center px-4 py-12 md:py-16">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200 p-8">
          <h2 className="text-2xl font-bold mb-4">Reset your password</h2>
          <p className="text-sm text-slate-600 mb-4">
            Enter the email address associated with your account (or your
            register number). We'll send a password reset link.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start mb-4">
              <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {message && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
              <span className="text-sm">{message}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email or Register No
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg"
                  placeholder="College Email or Reg. No."
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="submit"
                disabled={loading}
                className="py-2 px-4 bg-blue-600 text-white rounded"
              >
                {loading ? "Sending..." : "Send reset link"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="py-2 px-4 border rounded"
              >
                Back to login
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
