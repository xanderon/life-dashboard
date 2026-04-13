import { THEME_BOOTSTRAP_SCRIPT } from "@/components/ThemeScript";

export default function Head() {
  return (
    <script
      id="theme-bootstrap"
      dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
    />
  );
}
