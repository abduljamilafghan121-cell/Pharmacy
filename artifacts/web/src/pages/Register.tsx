import { Redirect } from "wouter";

// Self-registration is disabled — this is a staff-operated POS system.
// Account creation is done by admins only.
export default function Register() {
  return <Redirect to="/login" />;
}
