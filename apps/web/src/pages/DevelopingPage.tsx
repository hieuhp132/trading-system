import { ArrowLeft, Construction } from "lucide-react";
import { Link } from "react-router-dom";

interface DevelopingPageProps {
  eyebrow?: string;
  title?: string;
  description?: string;
}

export function DevelopingPage({
  eyebrow = "COMING NEXT",
  title = "Tính năng đang được phát triển",
  description = "Khu vực này đang được hoàn thiện để mang lại trải nghiệm ổn định và nhất quán hơn.",
}: DevelopingPageProps) {
  return (
    <div className="app-page developing-page">
      <div className="developing-page__mark" aria-hidden="true">
        <Construction size={28} />
      </div>
      <p className="app-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
      <Link to="/app" className="developing-page__back">
        <ArrowLeft size={16} /> Về tổng quan
      </Link>
    </div>
  );
}
