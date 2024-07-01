import React, { useCallback } from 'react';
import c from 'classnames';

export function InputBody(props: {
  body: string;
  setBody: (body: string) => void;
}) {
  return (
    <textarea
      className="textarea h-[90%] w-full resize-none"
      value={props.body}
      onChange={(e) => props.setBody(e.target.value)}
    />
  );
}

export function FormBodyTable(props: {
  formBody: [string, string, boolean?][];
  setFormBody: (formBody: [string, string, boolean?][]) => void;
}) {
  const toggleKV = useCallback(
    (index: number) => {
      const newFormBody = [...props.formBody];
      newFormBody[index][2] = !newFormBody[index][2];
      props.setFormBody(newFormBody);
    },
    [props.formBody],
  );

  const setKV = useCallback(
    (index: number, key: string, value: string) => {
      const newFormBody = [...props.formBody];
      newFormBody[index] = [key, value];
      props.setFormBody(newFormBody);

      if (index === props.formBody.length - 1 && (key || value)) {
        props.setFormBody([...newFormBody, ['', '', true]]);
      }
    },
    [props.formBody],
  );

  const last = props.formBody.length - 1;

  return (
    <table className="border border-slate-300 border-collapse table-fixed w-full">
      <tbody>
        {props.formBody.map(([key, value, silent], i) => (
          <tr
            key={i}
            className={c('border-b border-slate-200', {
              'opacity-30': !!silent,
            })}
          >
            <td className="w-8 text-center pt-2">
              {last !== i && (
                <input
                  type="checkbox"
                  onChange={() => toggleKV(i)}
                  checked={!silent}
                />
              )}
            </td>
            <td className="border border-slate-300 font-bold align-top break-all w-fit">
              <input
                className="input py-1 px-2 w-full"
                type="text"
                value={key}
                placeholder="Key"
                onChange={(e) => {
                  setKV(i, e.target.value, value);
                }}
              />
            </td>
            <td className="border border-slate-300 break-all align-top">
              <input
                className="input py-1 px-2 w-full"
                type="text"
                value={value}
                placeholder="Value"
                onChange={(e) => {
                  setKV(i, key, e.target.value);
                }}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function formatForRequest(
  input: string | [string, string, boolean?][],
  type: string,
): string {
  try {
    let pairs: [string, string][] = [];

    if (typeof input === 'string') {
      const lines = input.split('\n').filter((line) => line.trim() !== '');
      pairs = lines.map((line) => {
        const [key, value] = line.split('=').map((part) => part.trim());
        return [key, value];
      });
    } else {
      pairs = input
        .filter(([, , silent]) => silent !== true)
        .map(([key, value]) => [key, value]);
    }
    if (type === 'text/plain') {
      return JSON.stringify(input as string);
    }
    if (type === 'application/json') {
      const jsonObject = JSON.parse(input as string);
      return JSON.stringify(jsonObject);
    }

    if (type === 'application/x-www-form-urlencoded') {
      const searchParams = new URLSearchParams();
      pairs.forEach(([key, value]) => {
        searchParams.append(key, value);
      });
      return searchParams.toString();
    }

    return pairs.map(([key, value]) => `${key}=${value}`).join('&');
  } catch (e) {
    console.error('Error formatting for request:', e);
    return '';
  }
}

export async function parseResponse(contentType: string, res: Response) {
  const parsedResponseData = {
    json: '',
    text: '',
    img: '',
    headers: Array.from(res.headers.entries()),
  };

  if (contentType?.includes('application/json')) {
    parsedResponseData.json = await res.json();
  } else if (contentType?.includes('text')) {
    parsedResponseData.text = await res.text();
  } else if (contentType?.includes('image')) {
    const blob = await res.blob();
    parsedResponseData.img = URL.createObjectURL(blob);
  } else {
    parsedResponseData.text = await res.text();
  }

  return parsedResponseData;
}
