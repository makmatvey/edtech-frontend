import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";

export default function DashboardPage() {
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
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Дашборд</h1>

      {loading && <p className="text-gray-500">Загрузка...</p>}
      {error && <p className="text-red-600">Ошибка: {error}</p>}

      {!loading && !error && items.length === 0 && (
        <p className="text-gray-500">Пока пусто. Бэкенд ещё не готов.</p>
      )}

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="bg-white p-4 rounded shadow">
              {item.title || JSON.stringify(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
