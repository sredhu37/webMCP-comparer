/** Markup that is already safe to insert into the page. */
export class Html {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

type Value = Html | string | number | boolean | null | undefined | readonly Value[];

function render(value: Value): string {
  if (value instanceof Html) return value.value;
  if (Array.isArray(value)) return (value as readonly Value[]).map(render).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(String(value));
}

/** Template tag that escapes every interpolated value unless it is already Html. */
export function html(strings: TemplateStringsArray, ...values: Value[]): Html {
  return new Html(strings.reduce((out, string, i) => out + render(values[i - 1]) + string));
}
