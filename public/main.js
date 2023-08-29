async function initPage(page, callback) {
  try {
    const res = await fetch(`/oauth/token`);
    if (!res.ok) throw "No access token";

    const info = {};
    info.accessToken = await res.text();

    initHeader(page);

    // Get a new token every 30 minutes
    setInterval(async () => {
        let res = await fetch(`/oauth/token?refresh=true`);
        if (res.ok) {
          info.accessToken = await res.text();
        } else {
          let res = await fetch("/oauth/url");
          const url = await res.text();
          location.href = url + `&state=${page}`;
        }
      }, 5000// 30 * 60 * 1000
    );
    
    callback(info);
  } catch (error) {
    const res = await fetch("/oauth/url");
    const url = await res.text();
    location.href = url + `&state=${page}`;
  }
}

async function initHeader(page) {
  let res = await fetch(`/userprofile`);

  if (res.ok) {
    const data = await res.json();
    console.log(data);
    const avatarImage = document.getElementById("avatarImage");
    avatarImage.src = data.picture;
    document.getElementById("userName").innerHTML = data.name;

    document.getElementById("signOut").onclick = async () => {
      // Log the user out (see https://aps.autodesk.com/blog/log-out-forge)
      const iframe = document.createElement("iframe");
      iframe.style.visibility = "hidden";
      document.body.appendChild(iframe);
      iframe.onload = async () => {
        await new Promise(resolve => setTimeout(() => resolve(), 2000));
        window.location.replace(page);
        document.body.removeChild(iframe);
      };
      let res = await fetch("/logout");
      const url = await res.text();
      iframe.src = url;
    };
  }
}