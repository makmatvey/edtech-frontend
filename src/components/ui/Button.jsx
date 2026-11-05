import { Link } from "react-router-dom";

const base =
  "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#aa3bff]";

const variants = {
  primary:
    "bg-[#aa3bff] text-white hover:bg-[#9635e6] shadow-sm",
  secondary:
    "bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 shadow-sm",
  ghost: "text-gray-700 hover:bg-gray-100",
  link: "text-[#aa3bff] hover:underline px-0 py-0 font-medium",
};

function join(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function Button({
  variant = "primary",
  className = "",
  to,
  href,
  type = "button",
  children,
  ...rest
}) {
  const classes = join(base, variants[variant] ?? variants.primary, className);

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
