import React, { ReactElement } from 'react';
import { useParams } from 'react-router';
import { useRequest } from '../../reducers/requests';
import RequestBuilder from '../../pages/RequestBuilder';

export default function Notarize(): ReactElement {
  const params = useParams<{ requestId: string }>();
  const request = useRequest(params.requestId);

  return (
    <div className="flex flex-col flex-nowrap flex-grow">
      <RequestBuilder
        subpath={'/notary/' + params.requestId}
        url={request.url}
        headers={request.requestHeaders.map(({ name, value }) => {
          return [name, value];
        })}
      />
    </div>
  );
}
