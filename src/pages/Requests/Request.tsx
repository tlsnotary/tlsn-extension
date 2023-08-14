import React, {ReactElement} from "react";
import Icon from "../../components/Icon";
import RequestDetail from "../../components/RequestDetail";
import RequestTable from "../../components/RequestTable";
import {useNavigate, useParams} from "react-router";
import {useRequest} from "../../reducers/requests";

type Props = {
  activeTab?: chrome.tabs.Tab | null;
};

export default function Request(props: Props): ReactElement {
  const {activeTab} = props;
  const params = useParams<{requestId: string}>();
  const request = useRequest(params.requestId);
  const navigate = useNavigate();
  const url = activeTab?.url ? new URL(activeTab.url) : null;

  return (
    <>
      <div className="flex flex-nowrap flex-row items-center relative gap-2 p-2 justify-center bg-slate-100 w-full">
        <img src={activeTab?.favIconUrl} className="h-5 rounded-full" alt="logo" />
        <div className="text-sm">{url?.origin}</div>
      </div>
      <RequestDetail
        data={request}
      />
    </>
  )
}