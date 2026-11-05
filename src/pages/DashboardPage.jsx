import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  HackathonBadge,
  IconBook,
  LoadingBlock,
  PageHeader,
  ProgressBar,
  StatCard,
  IconChart,
  IconUsers,
} from "../components/ui";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch("/items");
        setItems(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Дашборд"
        badge={<HackathonBadge />}
        description="Сводка по цифровизации учебного процесса. Подключите бэкенд — список элементов подтянется автоматически."
        actions={
          <Button variant="secondary" onClick={() => navigate("/ui-kit")}>
            Открыть UI-кит
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Подключённые классы" value="—" hint="из API" icon={<IconUsers className="size-5" />} />
        <StatCard label="Заполненность журнала" value="—" icon={<IconBook className="size-5" />} />
        <StatCard label="Индекс эффективности" value="—" icon={<IconChart className="size-5" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Этапы внедрения</CardTitle>
          <CardDescription>Пример прогресс-баров из UI-кита</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProgressBar label="Интеграция с бэкендом" value={items.length > 0 ? 100 : 35} />
          <ProgressBar label="Пилот в СОШ" value={55} />
          <ProgressBar label="Пилот в СПО" value={28} />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Данные с сервера</h2>

        {loading && <LoadingBlock label="Загрузка..." />}

        {error && (
          <Alert variant="error" title="Не удалось загрузить данные">
            {error}
          </Alert>
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon={<IconBook className="size-6" />}
            title="Пока пусто"
            description="Бэкенд ещё не отдаёт /items. UI-кит уже готов — собирайте экраны на его компонентах."
            actionLabel="Перейти к UI-киту"
            onAction={() => navigate("/ui-kit")}
          />
        )}

        {!loading && !error && items.length > 0 && (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <Card>
                  <CardContent className="py-4 text-sm font-medium text-ink">
                    {item.title || JSON.stringify(item)}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
