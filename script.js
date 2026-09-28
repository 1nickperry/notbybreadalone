// function runFunc() {
    
//     let v = document.querySelector('dl dt a').innerText
//     alert(v)
//    document.ATTRIBUTE_NODE = v.remove()
// }
// function runFuncTwo() {
//     let v = document.querySelector('dl dt a').innerText
//     alert(v);
// }
// runFunc();
// runFuncTwo();

// var element = document.querySelector("dd");

// element.classList.add("vclass");

var counter = 1;
function foo()
{
    var element = document.querySelector("dd");
    element.classList.add("vclass");
    element.Pop()
    if (counter < 5){
        counter++
        window.setTimeout(foo, 1000);
    }
    
}

foo()// it will run 5 times;