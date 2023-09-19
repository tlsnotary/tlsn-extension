import classNames from 'classnames';
import React, { ReactElement, useCallback, useEffect, useState } from 'react';

export default function ResponseDetail(props: {
  response: Response | null;
  className?: string;
}): ReactElement {
  const [json, setJSON] = useState<any | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [formData, setFormData] = useState<URLSearchParams | null>(null);

  useEffect(() => {
    const resp = props.response;

    if (!resp) return;

    const contentType =
      resp.headers.get('content-type') || resp.headers.get('Content-Type');

    if (contentType?.includes('application/json')) {
      resp.json().then((json) => {
        if (json) {
          setJSON(json);
        }
      }).catch();
    } else if (contentType?.includes('text')) {
      resp.text().then((_text) => {
        if (_text) {
          setText(_text);
        }
      }).catch();
    } else if (contentType?.includes('image')) {
      resp.blob().then((blob) => {
        if (blob) {
          setImg(URL.createObjectURL(blob));
        }
      }).catch();
    } else {
      resp
        .blob()
        .then((blob) => blob.text())
        .then((_text) => {
          if (_text) {
            setText(_text);
          }
        })
        .catch();
    }
  }, [props.response]);

  return (
    <div className={classNames("flex flex-col flex-nowrap overflow-y-auto", props.className)}>
      <table className="border border-slate-300 border-collapse table-fixed w-full">
        {!!props.response?.headers && (
          <>
            <thead className="bg-slate-200">
              <tr>
                <td colSpan={2} className="border border-slate-300 py-1 px-2">
                  Headers
                </td>
              </tr>
            </thead>
            <tbody>
              {Array.from(props.response.headers.entries()).map(([name, value]) => {
                return (
                  <tr className="border-b border-slate-200">
                    <td className="border border-slate-300 font-bold align-top py-1 px-2 whitespace-nowrap">
                      {name}
                    </td>
                    <td className="border border-slate-300 break-all align-top py-1 px-2">
                      {value}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </>
        )}
        {!!json && (
          <>
            <thead className="bg-slate-200">
              <tr>
                <td colSpan={2} className="border border-slate-300 py-1 px-2">
                  JSON
                </td>
              </tr>
            </thead>
            <tr>
              <td colSpan={2}>
                <textarea
                  rows={16}
                  className="w-full bg-slate-100 text-slate-600 p-2 text-xs break-all h-full outline-none font-mono"
                  value={JSON.stringify(json, null, 2)}
                ></textarea>
              </td>
            </tr>
          </>
        )}
        {!!text && (
          <>
            <thead className="bg-slate-200">
              <tr>
                <td colSpan={2} className="border border-slate-300 py-1 px-2">
                  Text
                </td>
              </tr>
            </thead>
            <tr>
              <td colSpan={2}>
                <textarea
                  rows={16}
                  className="w-full bg-slate-100 text-slate-600 p-2 text-xs break-all h-full outline-none font-mono"
                  value={text}
                ></textarea>
              </td>
            </tr>
          </>
        )}
        {!!img && (
          <>
            <thead className="bg-slate-200">
              <tr>
                <td colSpan={2} className="border border-slate-300 py-1 px-2">
                  Img
                </td>
              </tr>
            </thead>
            <tr>
              <td className="bg-slate-100" colSpan={2}>
                <img src={img} />
              </td>
            </tr>
          </>
        )}
      </table>
    </div>
  );
}