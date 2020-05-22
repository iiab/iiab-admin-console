<?php
/*
*  upload-image.php
*  menu def icon for admin console
*/

header('Content-type: application/json');
//$error_reply["Error"] = "Error uploading image file.";

if ($_FILES['file']['error'] > 0) {
  $error_reply["Error"] = "Error " .  $_FILES['file']['error'] . " during upload of image file.";
  exit(json_encode($error_reply));
}
  $upload_image = $_FILES['file']['name'];
  $move_src = $_FILES['file']['tmp_name'];
  $err_msg = "Uploading " . $upload_image . " to " . $move_src;
if (empty($_FILES['file']['name']) || empty($_FILES['file']['tmp_name'])) {
  //$error_reply["Error"] = "Error, no file was uploaded.";
  $error_reply["Error"] = $err_msg;
  exit(json_encode($error_reply));
}

  $upload_image = $_FILES['file']['name'];
  $move_src = $_FILES['file']['tmp_name'];
  $dest = '/library/working/uploads/' . $upload_image;
  // we will move from working to images in cmdsrv for security
  $rc = move_uploaded_file($move_src, $dest);
if (! $rc) {
   $error_reply["Error"] = "Error moving " . $move_src . " to " . $dest;
   exit(json_encode($error_reply));
}
$reply["Success"] =  $_FILES['file']['name'] . "Uploaded Successfully.";

echo json_encode($reply);
?>
