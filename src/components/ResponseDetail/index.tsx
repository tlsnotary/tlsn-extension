import classNames from 'classnames';
import React, { ReactElement } from 'react';

export default function ResponseDetail(props: {
  responseData: {
    json: any | null;
    text: string | null;
    img: string | null;
    headers: [string, string][] | null;
  } | null;
  className?: string;
}): ReactElement {
  return (
    <div
      className={classNames(
        'flex flex-col flex-nowrap overflow-y-auto',
        props.className,
      )}
    >
      <table className="border border-slate-300 border-collapse table-fixed w-full">
        {!!props.responseData?.json && (
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
                  value={JSON.stringify(props.responseData.json, null, 2)}
                ></textarea>
              </td>
            </tr>
          </>
        )}
        {!!props.responseData?.text && (
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
                  value={props.responseData.text}
                ></textarea>
              </td>
            </tr>
          </>
        )}
        {!!props.responseData?.img && (
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
                <img src={props.responseData.img} />
              </td>
            </tr>
          </>
        )}
        {!!props.responseData?.headers && (
          <>
            <thead className="bg-slate-200">
              <tr>
                <td colSpan={2} className="border border-slate-300 py-1 px-2">
                  Headers
                </td>
              </tr>
            </thead>
            <tbody>
              {props.responseData?.headers.map(([name, value]) => {
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
      </table>
    </div>
  );
}
