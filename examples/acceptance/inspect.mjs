/** Read-only connection smoke check. No runs, source reads, effects or approvals created.
 * Metadata only is returned; published context and saved observations stay local. */
export async function inspectConnection(client,{workspace,processId,stageId,runId}) {
 if(!workspace || (stageId && !processId))throw Error('Choose a workspace and a process for a stage.');
 const catalog=await client.models.discover({workspace});
 const selected=catalog.operating_models.find(m=>m.workspace===workspace);
 if(!selected)throw Error('No accessible published operating model in the selected workspace.');
 const release=await client.models.read({workspace,expected_release_version:selected.version});
 const report={kind:'read_only_connection_smoke',checkedAt:new Date().toISOString(),node:process.version,workspace,releaseVersion:release.version,availableToolCount:client.availableTools().length,checks:['discovery','pinned_model_snapshot'],limitations:['Not a fresh source read, action execution or browser/assistant acceptance.']};
 if(processId){
  const context=await client.processes.context({workspace,process_id:processId,view:stageId?'details':'overview',...(stageId?{stage_id:stageId}:{}),expected_release_version:release.version});
  report.processId=context.process.id;report.checks.push('pinned_process_context');
  if(stageId)report.stageId=stageId;
 }
 if(runId){
  const run=await client.processes.read({workspace,run_id:runId});
  if(processId && run.process_id!==processId)throw Error('Selected run belongs to a different process.');
  report.run={id:run.id,revision:run.revision,releaseVersion:run.release_version,savedStageCount:Object.keys(run.stage_data??{}).length};report.checks.push('saved_run_snapshot');
 }
 return report;
}
