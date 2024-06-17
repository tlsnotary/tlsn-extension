import React, { useCallback, useState } from 'react';
import c from 'classnames'




export function InputBody (props: {
  value: string;
  body: string;
  setBody: (body: string) => void;
  type: string;
}) {
  return (
    <textarea className="textarea h-[90%] w-full resize-none"
      value={props.body}
      onChange={(e) => props.setBody(e.target.value)}
    />
  );
}

export function FormBodyTable(props: {
  formBody: [string, string, boolean?][];
  setFormBody: (formBody: [string, string, boolean?][]) => void;

}) {

  const toggleKV = useCallback((index: number) => {
    const newFormBody = [...props.formBody];
    newFormBody[index][2] = !newFormBody[index][2];
    props.setFormBody(newFormBody);
  }, [props.formBody]);

  const setKV = useCallback((index: number, key: string, value: string) => {
    const newFormBody = [...props.formBody];
    newFormBody[index] = [key, value];
    props.setFormBody(newFormBody);

    if (index === props.formBody.length - 1 && (key || value)) {
      props.setFormBody([...newFormBody, ['', '', true]]);
    }
  }, [props.formBody]);

  const last = props.formBody.length - 1;

  return (
    <table className="border border-slate-300 border-collapse table-fixed w-full">
      <tbody>
        {props.formBody.map(([key, value, silent], i) => (
          <tr
            key={i}
            className={c('border-b border-slate-200', {
              'opacity-30': !!silent
            })}>
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
                className='input py-1 px-2 w-full'
                type="text"
                value={key}
                placeholder='Key'
                onChange={(e) => {
                  setKV(i, e.target.value, value)
                }}
              />
            </td>
            <td className='border border-slate-300 break-all align-top'>
              <input
                className="input py-1 px-2 w-full"
                type="text"
                value={value}
                placeholder='Value'
                onChange={(e) => {
                  setKV(i, key, e.target.value)
                }}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function formatForRequest(input: string, type: string): string {
  try {
    if (type === 'json') {
      const jsonObject = JSON.parse(input);
      console.log('here', jsonObject);
      return JSON.stringify(jsonObject);
    }
    if (type === 'x-www-form-urlencoded') {
      const lines = input.split('\n').filter((line) => line.trim() !== '');
      const searchParams = new URLSearchParams();
      lines.forEach((line) => {
        const [key, value] = line.split('=').map((part) => part.trim());
        searchParams.append(key, value);
      });
      return searchParams.toString();
    }
    return input;
  } catch (e) {
    const lines = input.split('\n').filter((line) => line.trim() !== '');
    const jsonObject: { [key: string]: string } = {};

    lines.forEach((line) => {
      const [key, value] = line
        .split(':')
        .map((part) => part.trim().replace(/['"]/g, ''));
      jsonObject[key] = value;
    });

    return JSON.stringify(jsonObject);
  }
}
