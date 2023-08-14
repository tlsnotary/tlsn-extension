import React, {ReactElement, useEffect, useState} from "react";
import {RequestLog} from "../../pages/Background/actionTypes";
import {useNavigate} from "react-router";

type Props = {
  requests: RequestLog[];
};

export default function RequestTable(props: Props): ReactElement {
  const {requests} = props;
  const navigate = useNavigate();
  return (
    <div className="flex flex-col flex-nowrap overflow-y-auto">
      <table className="border border-slate-300 border-collapse table-fixed w-full">
        <thead className="bg-slate-200">
        <tr>
          <td className="border border-slate-300 py-1 px-2 w-2/12">Method</td>
          <td className="border border-slate-300 py-1 px-2 w-3/12">Type</td>
          <td className="border border-slate-300 py-1 px-2">Name</td>
        </tr>
        </thead>
        <tbody>
        {requests.map(r => (
          <tr
            key={r.requestId}
            onClick={() => navigate('/requests/' + r.requestId)}
            className="cursor-pointer hover:bg-slate-100"
          >
            <td className="border border-slate-200 align-top py-1 px-2 whitespace-nowrap w-2/12">{r.method}</td>
            <td className="border border-slate-200 align-top py-1 px-2 whitespace-nowrap w-3/12">{r.type}</td>
            <td className="border border-slate-200 py-1 px-2 break-all truncate">
              {r.url && new URL(r.url).pathname}
            </td>
          </tr>
        ))}
        </tbody>
      </table>
    </div>
  );
}