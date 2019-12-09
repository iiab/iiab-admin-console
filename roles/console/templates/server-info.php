<?php
/*
*  server_info.php
*  send server and client ip to client
*/
// phpinfo();

exec("pgrep -f iiab-cmdsrv", $pids);
if(empty($pids))
  $cmdsrv_running = "FALSE";
else
  $cmdsrv_running = "TRUE";

header('Content-type: application/json');
echo '{"iiab_server_ip":"'.$_SERVER['SERVER_ADDR'].'","iiab_client_ip":"'.$_SERVER['REMOTE_ADDR'].'","iiab_cmdsrv_running":"'.$cmdsrv_running.'"}';
?>
