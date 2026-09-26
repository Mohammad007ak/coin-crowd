# Coin Crowd — بنر آدمک‌های سکه‌ای

کد بنر صفحه‌ی اصلی (جمعیت آدمک‌های سر‌سکه‌ای) جدا شده تا در یک پروژه‌ی جدید React استفاده شود.
هیچ وابستگی‌ای جز `react` ندارد.

## فایل‌ها

| فایل | کار |
| --- | --- |
| `Figure.jsx` | خود آدمک به صورت SVG (`figureSvg`) و کامپوننت `<Figure />` |
| `CoinCrowd.jsx` | بنر: جمعیت روی canvas که دنبال موس/انگشت می‌آیند، عصبانی می‌شوند، گوجه و تخم‌مرغ پرت می‌کنند |
| `coin-crowd.css` | استایل بنر و آدمک (خودش داخل `CoinCrowd.jsx` import می‌شود؛ برای `Figure` تنها، دستی import کنید) |
| `Example.jsx` | نمونه‌ی استفاده |

## نصب

۱. اجرای نمونه: `npm install` و بعد `npm run dev`. برای استفاده در پروژه‌ی دیگر، پوشه‌ی `src/crowd/` را کپی کنید.
۲. (اختیاری) فونت‌ها برای متن فارسی:

```bash
npm i @fontsource-variable/estedad @fontsource-variable/vazirmatn
```

```js
import "@fontsource-variable/estedad";
import "@fontsource-variable/vazirmatn";
```

۳. استفاده:

```jsx
import CoinCrowd from "./crowd/CoinCrowd.jsx";

<CoinCrowd title="عنوان" text="زیرعنوان" count={12} />
```

## پراپ‌های `CoinCrowd`

| پراپ | پیش‌فرض | توضیح |
| --- | --- | --- |
| `title`, `text` | — | عنوان و زیرعنوان روی بنر |
| `count` | `12` | تعداد آدمک‌ها |
| `done` | `0` | چند نفر تیک سبز بالای سرشان دارند |
| `present` | `count` | چند صندلی پر است؛ بقیه کم‌رنگ |
| `cast` | همه `plain` | نوع هر آدمک به ترتیب: `"plain"`، `"me"` (سکه‌ی طلایی با برچسب «شما»)، `"logo"` (سکه‌ی آبی با لوگو) |
| `meDone` | `false` | «شما» هم تیک بخورد |
| `angry` | `false` | بنر قرمز و آدمک‌ها عصبانی |
| `pelting` | `false` | (با `angry`) به «شما» گوجه و تخم‌مرغ پرت می‌کنند |
| `action` | — | یک دکمه زیر متن (کلاس `crowd-action` بدهید) |
| `hintMouse`, `hintTouch` | متن فارسی | راهنمای بار اول |
| `className` | — | مثلاً `"crowd-full"` برای بنر تمام‌صفحه روی دسکتاپ |

## پراپ‌های `Figure`

`size`، `pose` (`"stand"` / `"a"` / `"b"`)، `face` (رنگ سکه)، `label`، `labelColor`، `check`، `empty`، `logo`، `angry`، `me`، `worried`، `title`.

## شخصی‌سازی سریع

- رنگ پس‌زمینه: `.crowd { background }` در `coin-crowd.css`.
- رنگ خط: `INK` در `Figure.jsx`.
- لوگوی روی سکه: متغیر `mark` در `figureSvg` (الان شورون سفید و سکه‌ی طلایی دیجی‌پی است — برای برند خودتان عوضش کنید).
- کلمه‌های برخورد («شلپ!» / «ترق!») و برچسب «شما»: داخل `CoinCrowd.jsx`.
