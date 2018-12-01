<?php
header('Content-type: application/json');
if (session_status() == PHP_SESSION_NONE ) {session_start();}

//print_r(get_defined_vars());
//var_dump($GLOBALS);
//echo json_encode(get_defined_vars());

$return = "ERROR:No comments found.";

if( $_POST )
{
	$return = "SUCCESS";
	$con = new mysqli("localhost", "iiab_commenter", "g0adm1n", "iiab_feedback");

	if (mysqli_connect_errno()) {
		$return = "ERROR:" . mysqli_connect_error ();
	}
	else {

		$session_id = session_id();
		$name = $_POST['name'];
    $email = $_POST['email'];
    $about_you = $_POST['about_you'];
    $rating=$_POST['rating'];
    $comments = $_POST['comments'];
    $datetime_created = date ("Y-m-d H:i:s");

    // this is probably not necessary
    //$name = mysqli_real_escape_string($con, $_POST['name']);
    //$email = mysqli_real_escape_string($con, $_POST['email']);
    //$about_you = mysqli_real_escape_string($con, $_POST['about_you']);
    //$comments = mysqli_real_escape_string($con, $_POST['comments']);

		$sql = "INSERT INTO comments (session_id, name, email, about_you, rating, comments, datetime_created) VALUES (?, ?, ?, ?, ?, ?, ?)";
		$sql_stmt = mysqli_prepare ($con, $sql);
		$sql_stmt->bind_param('ssssdss', $session_id, $name, $email, $about_you, $rating, $comments, $datetime_created);
		//mysqli_stmt_bind_param($sql_stmt, 'ssdsss', $name, $email, $about_you, $rating, $comments, $datetime_created);
		$rc = mysqli_stmt_execute($sql_stmt);
		mysqli_close($con);
		if ( !$rc )
		   $return = "ERROR:Unable to submit comment";
	}
}

echo json_encode($return);
?>
