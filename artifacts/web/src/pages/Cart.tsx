import { Redirect } from "wouter";

// Cart is removed — this is a staff POS system. Use New Sale instead.
export default function Cart() {
  return <Redirect to="/new-sale" />;
}
