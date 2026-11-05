import { useNavigate } from "react-router-dom";
import { EmptyState, IconBook } from "../components/ui";

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-lg py-8">
      <EmptyState
        icon={<IconBook className="size-6" />}
        title="404 — страница не найдена"
        description="Проверьте адрес или вернитесь на дашборд."
        actionLabel="На главную"
        onAction={() => navigate("/")}
      />
    </div>
  );
}
