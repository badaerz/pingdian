import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "icon" };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant = "primary", type = "button", ...props }, ref) {
  return <button ref={ref} type={type} className={cn("button", `button-${variant}`, className)} {...props} />;
});
