// Examples: copy whichever you need.
import CoinCrowd from "./CoinCrowd.jsx";
import { Figure } from "./Figure.jsx";

export default function Example() {
  return (
    <div dir="rtl" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 24, padding: 16 }}>
      {/* A plain crowd of 12. */}
      <CoinCrowd title="با هم، زودتر به پول برسید" text="هر ماه یکی از جمع، کل مبلغ را یک‌جا می‌گیرد." count={12} />

      {/* A group of 10: 4 already checked, the member ("شما") and the logo figure. */}
      <CoinCrowd
        title="طرح ۱۰ نفره"
        text="۴ نفر از ۱۰ نفر وامشان را گرفته‌اند."
        count={10}
        done={4}
        cast={["plain", "plain", "plain", "plain", "plain", "plain", "me", "plain", "plain", "logo"]}
      />

      {/* Angry and throwing tomatoes/eggs at the member, with a button. */}
      <CoinCrowd
        title="قسطتان عقب افتاده!"
        text="تا تسویه نکنید در قرعه شرکت داده نمی‌شوید."
        count={8}
        cast={["plain", "plain", "plain", "me", "plain", "plain", "plain", "logo"]}
        angry
        pelting
        action={<button className="crowd-action">پرداخت</button>}
      />

      {/* Single figures (SVG). */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
        <Figure size={80} />
        <Figure size={80} pose="a" me />
        <Figure size={80} logo />
        <Figure size={80} angry />
        <Figure size={80} me worried />
        <Figure size={80} check label="۳" />
        <Figure size={80} empty />
      </div>
    </div>
  );
}
