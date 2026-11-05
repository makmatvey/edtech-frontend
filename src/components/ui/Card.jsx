export default function Card({ className = "", children, ...rest }) {
  return (
    <div
      className={`bg-white p-6 rounded-lg shadow border border-gray-100 ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}
