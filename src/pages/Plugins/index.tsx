import React, { ReactElement } from "react";
import { PluginList } from "../../components/PluginList";

export default function Plugins(): ReactElement {
  return (
    <div className="flex flex-col flex-nowrap flex-grow">
      <PluginList className="p-2 overflow-y-auto" />
    </div>
  )
}