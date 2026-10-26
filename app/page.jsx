import AccountShell from "./account-shell.jsx";
import { configured } from "../lib/server/db.mjs";
export const dynamic = "force-dynamic";
export default function Page() {
  return <AccountShell configured={configured()} />;
}
