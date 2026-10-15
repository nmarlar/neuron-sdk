/** Read-only developer journey. Every choice comes from a consented server result.
 * No runs, source reads, hosted guidance, edits or business actions are invoked. */
export async function discover(client) {
 const [contexts, models] = await Promise.all([
  client.call('discover_workspace_contexts', {}), client.models.discover(),
 ]);
 return {contexts, models};
}
export async function readModel(client, catalog, workspace) {
 const selected = catalog.models.operating_models.find(item => item.workspace === workspace);
 if (!selected) throw Error('Select a separately authorized published model. Reconnect and select its Operating model entry if needed.');
 return client.models.read({workspace, expected_release_version:selected.version});
}
export async function readProcess(client, workspace, release, processId) {
 if (!(release.model.processes ?? []).some(item => item.id === processId)) throw Error('Select a process from the model you just read.');
 const args = {workspace, process_id:processId, expected_release_version:release.version};
 const overview = await client.processes.context({...args, view:'overview'});
 const details = await client.processes.context({...args, view:'details'});
 return {overview, details};
}
export async function readStage(client, workspace, release, process, stageId) {
 if (!(process.overview.stage_directory ?? []).some(item => item.id === stageId)) throw Error('Select a stage from the process overview.');
 return client.processes.context({workspace, process_id:process.overview.process.id, stage_id:stageId,
  expected_release_version:release.version, view:'focused'});
}
