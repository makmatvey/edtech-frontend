import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useTitle } from "../lib/hooks";

export default function NotFound({ inline = false }: { inline?: boolean }) {
  useTitle("Страница не найдена");
  const { user } = useAuth();
  const home = !user ? "/login" : user.role === "teacher" ? "/t" : "/s";
  return (
    <div className={inline ? "" : "grid-paper"} style={{ minHeight: inline ? "60vh" : "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
        <span className="mark xl">404</span>
        <h1 style={{ fontSize: 26 }}>Такой страницы нет</h1>
        <p className="ink-2" style={{ maxWidth: 380 }}>Возможно, ссылка устарела или в адресе опечатка.</p>
        <Link to={home} className="btn btn-primary"><Compass size={16} /> {user ? "В мой кабинет" : "Ко входу"}</Link>
      </div>
    </div>
  );
}
