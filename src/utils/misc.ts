export function urlify(
  text: string,
  params?: [string, string, boolean?][],
): URL | null {
  try {
    const url = new URL(text);

    if (params) {
      params.forEach(([k, v]) => {
        url.searchParams.append(k, v);
      });
    }

    return url;
  } catch (e) {
    return null;
  }
}

export function devlog(...args: any[]) {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
}

export function download(filename: string, content: string) {
  const element = document.createElement('a');
  element.setAttribute(
    'href',
    'data:text/plain;charset=utf-8,' + encodeURIComponent(content),
  );
  element.setAttribute('download', filename);

  element.style.display = 'none';
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}
