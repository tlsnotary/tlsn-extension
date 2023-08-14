import React, {ReactElement} from "react";
import RequestTable from "../../components/RequestTable";
import {useRequests} from "../../reducers/requests";

type Props = {
  activeTab?: chrome.tabs.Tab | null;
};

export default function Requests(props: Props): ReactElement {
  const { activeTab } = props;
  const url = activeTab?.url ? new URL(activeTab.url) : null;
  const requests = useRequests();
  return (
    <>
      <div className="flex flex-nowrap flex-row items-center relative gap-2 p-2 justify-center bg-slate-100 w-full">
        <img src={props.activeTab?.favIconUrl} className="h-5 rounded-full" alt="logo" />
        <div className="text-sm">{url?.origin}</div>
      </div>
      <RequestTable
        requests={requests}
      />
    </>
  );
}