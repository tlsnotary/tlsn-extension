import React, { ReactElement } from 'react';
import { useParams } from 'react-router';
import { useRequestHistory } from '../../reducers/history';
import RequestBuilder from '../../pages/RequestBuilder';

export default function Notarize(): ReactElement {
  const params = useParams<{ requestId: string }>();
  const request = useRequestHistory(params.requestId);

  return (
    <div className="flex flex-col flex-nowrap flex-grow">
      {request?.id}
    </div>
  );
}
