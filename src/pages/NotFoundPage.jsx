import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="text-center py-16">
      <h1 className="text-2xl font-semibold mb-2">404</h1>
      <p className="text-gray-500 mb-4">Такой страницы нет</p>
      <Link to="/" className="text-blue-600 hover:underline">
        На главную
      </Link>
    </div>
  );
}
