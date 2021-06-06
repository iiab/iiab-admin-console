<?php
  header("Content-Type: application/json; charset=UTF-8");
  $iiab_user_data = json_decode(file_get_contents('/srv/private/iiab_user_pat.json'), true);
  $iiab_user_data["iiab_user_ip"] = $_SERVER['REMOTE_ADDR'];
  $resp = json_encode($iiab_user_data);

  echo $resp;
?>



