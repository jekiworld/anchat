function user(name, age){
    this.name = name;
    this.age = age;
    this.greet = function(){
        console.log(this.name, this.age);
    }
}

const user1 = new user('Alice', 12);

user1.greet();