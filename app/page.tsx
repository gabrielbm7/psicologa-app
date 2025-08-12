import { redirect } from "next/navigation";

export default function Home() {
  redirect("/booking");
  return null;
}