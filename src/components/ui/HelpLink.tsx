import Icon from "./Icon";

// Redesign R0 — «Помощ», at the top of every page from R1 on: a plain link (works without JavaScript).
export default function HelpLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="ui-btn ui-btn-sm" data-help-link>
      <Icon name="help" size={22} />
      {label}
    </a>
  );
}
