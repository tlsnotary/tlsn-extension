import React, {ReactElement} from "react";
import { useHistory } from "../../reducers/history";
import Icon from "../../components/Icon";

type Props = {

}

export default function History(props: Props): ReactElement {
	const history = useHistory();

	console.log(history);
	return (
		<div className="flex flex-col flex-nowrap">
			{history.map((request) => {
				return (
					<div
						key={request.id}
						className="flex flex-row flex-nowrap border rounded-md p-2 gap-1 hover:bg-slate-50 cursor-pointer"
					>
						<div
							className="flex flex-col flex-nowrap flex-grow"
						>
						<div className="flex flex-row items-center text-xs">
						  <div className="bg-slate-200 text-slate-400 px-1 py-0.5 rounded-sm">
						    {request.method}
						  </div>
						  <div className="text-black font-bold px-2 py-1 rounded-md">
						    {request.url}
						  </div>
						</div>
						<div className="flex flex-row">
							<div className="font-bold text-slate-400">Notary API:</div>
							<div className="ml-2 text-slate-800">{request.notaryUrl}</div>
						</div>
						<div className="flex flex-row">
							<div className="font-bold text-slate-400">TLS Proxy API: </div>
							<div className="ml-2 text-slate-800">{request.websocketProxyUrl}</div>
						</div>
						</div>
						<div className="flex flex-col gap-1">
													<div 
							className="flex flex-row flex-grow-0 gap-2 self-end items-center justify-end px-2 py-1 bg-slate-100 text-slate-300 hover:bg-slate-200 hover:text-slate-500 hover:font-bold"
						>
	              			<Icon
	              				className=""
	              				fa="fa-solid fa-receipt"
	              				size={1}
              				/>
              				<span className="text-xs font-bold">View Proof</span>
						</div>
												<div 
							className="flex flex-row flex-grow-0 gap-2 self-end items-center justify-end px-2 py-1 bg-slate-100 text-slate-300 hover:bg-red-100 hover:text-red-500 hover:font-bold"
						>
	              			<Icon
	              				className=""
	              				fa="fa-solid fa-trash"
	              				size={1}
              				/>
              				<span className="text-xs font-bold">Cancel</span>
						</div>
						</div>
	              	</div>
				);
			})}
			<div>
			</div>
		</div>
	);
}