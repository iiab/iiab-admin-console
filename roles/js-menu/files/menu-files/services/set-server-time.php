<?php

exec ( "sudo /usr/bin/timedatectl", $output, $rcode); // NTP or System clock synchronized depending on OS
if ($rcode != 0) {
 exit("Error in timedatectl");
}

foreach ($output as $line){
  if (strpos($line, 'synchronized') !== false) {
    if (strpos($line, 'yes') !== false) {
      exit("Clock is synchronized");
    }
  }
}

if (!isset($_POST['user_utc_datetime']) ) {
  exit("Error in parameters");
}

//$user_agent = $_POST['user_agent'];
$user_utc_datetime = $_POST['user_utc_datetime'];
//$user_timezone = $_POST['user_timezone'];

if (!isset($_POST['user_utc_datetime']) )
{
   exit("Error in parameters");
}
//print $user_agent .'\n';
//print $user_utc_datetime .'\n';
//print $user_timezone .'\n';

$server_utc_plus_2min = gmdate("Y-m-d\TH:i:s\Z", strtotime('now +2 minutes'));

//echo $server_utc_plus_2min;

if ($user_utc_datetime >  $server_utc_plus_2min) {
  exec ( "sudo /bin/date -s " . $user_utc_datetime, $output, $rcode);
  if ($rcode != 0) {
    echo "Error updating clock";
  } else {
    exec ("sudo /sbin/fake-hwclock save", $output, $rcode);
    echo "Clock updated";
  }

} else {
  echo "Clock already updated";
}

?>
